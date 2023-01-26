const sortBy = require('lodash.sortby');
const makeGqlReq = require('../utils/baseRequest');
const { HOURS } = require('../utils/constants');
const Command = require('./Command');
const Pass = require('./Pass');

class Satellite {
	/**
	 * @param {object} param0
	 * @param {number|string} param0.id
	 * @param {number|string} param0.noradId
	 * @param {string} param0.name
	 * @param {string} param0.host
	 * @param {string} param0.token
	 * @param {string|number} param0.mission
	 */
	constructor({ id, noradId, name, host, token, mission }) {
		// if (!(id && noradId && name)) {
		// 	throw new Error('Cannot instantiate Satellite; ID, Norad ID, and name are all required');
		// }

		/**
		 * @member {number}
		 */
		this.id = id;
		this.noradId = noradId;
		this.name = name;
		this.makeReq = query => makeGqlReq(host, token)(query);
		this.credentials = () => ({ host, token });
		this.mission = mission;
	}

	/**
	 * @returns {Promise<Command[]>}
	 */
	getQueuedCommands() {
		return new Promise((resolve, reject) => {
			const query = `
				query GetQueuedCommands {
					system(id:${this.id}) {
						commands(filters: {state:queued}) {
							nodes {
								id
								fields
								gateway { id }
								updatedAt
								commandDefinition {
									id
								}
							}
						}
					}
				}
			`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					/**
					 * @type {any[]}
					*/
					const queuedCommands = sortBy(data.data.system.commands.nodes, 'updatedAt');
					const resolved = queuedCommands
						.map(({ id, fields, gateway: { id: gateway }, commandDefinition: { id: command } }) => {
							const asCommand = new Command({ command, system: this.id, fields: JSON.parse(fields) });

							asCommand.setGateway(gateway);
							asCommand.setId(id);

							return asCommand;
						});

					resolve(resolved);
				})
				.catch(err => reject(err));
		});
	}

	/**
	 * @returns {Promise<any[]>}
	 */
	getRemoteFiles() {
		return new Promise((resolve, reject) => {
			const query = `
				query GetRemoteFiles {
					system(id:${this.id}) {
						remoteFileList {
							files
						}
					}
				}
			`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					const { files } = data.data.system.remoteFileList || {};

					try {
						resolve(JSON.parse(files));
					} catch (err) {
						resolve([]);
					}
				})
				.catch(err => reject(err));
		});
	}

	/**
	 * @returns {Promise<any[]>}
	 */
	getStagedFiles() {
		return new Promise((resolve, reject) => {
			const query = `
				query GetStagedFiles {
					system(id:${this.id}) {
						stagedFiles {
							nodes {
								id
								size
								name
								comment
								createdAt
								updatedAt
								checksum
								downloadPath
							}
						}
					}
				}
			`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					resolve(data.data.system.stagedFiles.nodes);
				})
				.catch(err => reject(err.message));
		});
	}

	/**
	 * Retrieves recent events associated with the satellite. Defaults to retrieving the last 24 hours
	 * of events, but can be filtered to focus on a smaller span of time in the past, and filtered by
	 * level and type.
	 * @param {object} [opts]
	 * @param {number} opts.hours
	 * @param {number} opts.ending
	 * @param {string|string[]} opts.type
	 * @param {string|string[]} opts.level
	 * @returns {Promise<EventObject[]>}
	 */
	getRecentSystemEvents(opts = {}) {
		return new Promise((resolve, reject) => {
			const now = Date.now();
			const { hours = 24, ending = 0 } = opts;
			const type = Array.isArray(opts.type) ? `[${opts.type.join(',')}]` : opts.type;
			const level = Array.isArray(opts.level) ? `[${opts.level.join(',')}]` : opts.level;
			const endTime = now - (ending * HOURS);
			const startTime = endTime - (Math.min(hours, 24) * HOURS);

			const query = `
				query GetRecentSystemEvents {
					mission(id:${this.mission}) {
						events(filters: {
							startTime:${startTime}
							endTime:${endTime}
							${type ? `type:${type} ` : ''}
							${level ? `level:${level} ` : ''}
						}) {
							nodes {
								id
								debug
								message
								timestamp
								type
								level
								command { id }
								createdAt
							}
						}
					}
				}
			`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					/**
					 * @type {EventObject[]}
					 */
					const eventObjects = data.data.mission.events.nodes.map(node => {
						const { command, ...rest } = node;

						return { ...rest, commandId: command.id };
					});

					resolve(eventObjects);
				})
				.catch(err => reject(err));
		});
	}

	/**
	 * Gets next available pass for this satellite. If groundStationId parameter is provided, retrieves
	 * the next available pass for this satellite over the identified ground station.
	 * @param {number|string} groundStationId
	 * @returns {Promise<Pass|null>}
	 */
	getNextAvailablePass(groundStationId) {
		return new Promise((resolve, reject) => {
			const query = `
				query GetNextPass {
					system(id:${this.id}) {
						passes(first:100 orderBy:{sort:START, direction:DESC}) {
							nodes {
								id
								duration
								groundStationId
								start
								end
								scheduledStatus
							}
						}
					}
				}`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					const now = Date.now();
					const passes = data.data.system.passes.nodes;
					const pass = (
						Number.isInteger(Number(groundStationId))
							? passes.filter(({ groundStationId: passGs }) => Number(passGs) === Number(groundStationId))
							: passes
					)
						.reverse()
						.find(({ start, scheduledStatus }) => (start > now && scheduledStatus === 'available'));

					if (!pass) {
						resolve(null);
					}

					resolve(new Pass({
						...pass, ...this.credentials(), satelliteId: `${this.id}`,
					}));
				})
				.catch(err => {
					reject(err.message);
				});
		});
	}

	/**
	 * Gets the next pass regardless of scheduled status for this satellite. If the groundStationId
	 * parameter is provided, gets the next pass of this satellite over the identified ground
	 * station.
	 * @param {number|string} groundStationId
	 * @returns {Promise<Pass|null>}
	 */
	getNextPass(groundStationId) {
		return new Promise((resolve, reject) => {
			const query = `
				query GetNextPass {
					system(id:${this.id}) {
						passes(first:100 orderBy:{sort:START, direction:DESC}) {
							nodes {
								id
								duration
								groundStationId
								start
								end
								scheduledStatus
							}
						}
					}
				}`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					const now = Date.now();
					const passes = data.data.system.passes.nodes;
					const pass = (
						Number.isInteger(Number(groundStationId))
							? passes.filter(({ groundStationId: passGs }) => Number(passGs) === Number(groundStationId))
							: passes
					)
						.reverse().find(({ start }) => start > now);

					resolve(new Pass({
						...pass, ...this.credentials(), satelliteId: `${this.id}`,
					}));
				})
				.catch(err => {
					reject(err.message);
				});
		});
	}
}

module.exports = Satellite;

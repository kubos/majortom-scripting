const get = require("lodash.get");
const makeGqlReq = require("../utils/baseRequest");
const { HOURS } = require("../utils/constants");
const Command = require('./Command');

class Gateway {
	static isGateway(obj) {
		return obj instanceof Gateway;
	}

	constructor({ id, name, connected, disabledAt, disablingUser }, { mission, host, token }) {
		this.id = id;
		this.name = name;
		this.connected = connected;
		this.disabledAt = disabledAt;
		this.disablingUser = disablingUser;
		this.mission = mission;

		this.makeReq = query => makeGqlReq(host, token)(query);
	}

	/**
	 *
	 * @param {object} opts
	 * @param {string|string[]} opts.type
	 * @param {number} opts.hours
	 * @param {number} opts.ending
	 * @returns {Promise<Command[]>}
	 */
	getRecentCommands(opts = {}) {
		return new Promise((resolve, reject) => {
			const now = Date.now();
			const { hours = 24, ending = 0 } = opts;
			const state = Array.isArray(opts.type) ? `[${opts.type.join(',')}]` : opts.type;
			const endTime = now - (ending * HOURS);
			const startTime = endTime - (Math.min(hours, 24) * HOURS);

			const query = `
				query GetRecentCommands {
					mission(id:${this.mission}) {
						commands(
							filters: { startUpdatedTime:${startTime} endUpdatedTime:${endTime} ${state ? `state:${state} ` : ''} },
							orderBy:{ sort: UPDATED_AT, direction: DESC }
						) {
							nodes {
								id
								fields
								system {
									id
								}
								commandDefinition {
									id
								}
								state
								status
								payload
								output
								updatedAt
							}
						}
					}
				}
			`.trim();

			this.makeReq({ query })
				.then(({ data }) => {
					const commands = get(data, 'data.mission.commands.nodes');

					if (!commands) {
						reject(new Error('There was a problem retrieving recent commands'));
					}

					resolve(commands.map(cmd => {
						const { system, commandDefinition, ...rest } = cmd;
						const asCommand = new Command({ ...rest, command: commandDefinition.id, system: system.id });

						asCommand.setGateway(this);

						return asCommand;
					}));
				})
				.catch(err => reject(err));
		});
	}
}

module.exports = Gateway;

const get = require('lodash.get');
const createGqlReq = require('./src/utils/baseRequest');
const Satellite = require('./src/classes/Satellite');
const Command = require('./src/classes/Command');
const Gateway = require('./src/classes/Gateway');
const typesDoMatch = require('./src/utils/typesDoMatch');

const FINAL_STATES = ['cancelled', 'failed', 'completed'];

const mts = ({ host, token }) => {
	let mission;

	if (!(host && token)) {
		throw new Error('Script instance requires a value for `host` `token` and `mission`');
	}

	const makeGqlReq = createGqlReq(host, token);

	const getMissionId = () => new Promise((resolve, reject) => {
		const query = `
			query Mission {
				agent {
					script {
						mission { id }
					}
				}
			}
		`;

		makeGqlReq({ query })
			.then(result => {
				const missionId = get(result, 'data.data.agent.script.mission.id');

				if (!missionId) {
					return reject(new Error('Could not get mission ID'));
				}

				mission = missionId;

				resolve(missionId);
			})
			.catch(err => {
				reject(err);
			});
	});

	/**
	 * @param {object} input
	 * @param {string} input.name
	 * @param {string|number} input.id
	 * @param {string|number} input.noradId
	 * @returns {Promise<Satellite>}
	 */
	const getSatellite = input => new Promise((resolve, reject) => {
		const params = ['name', 'id', 'noradId'];
		const queryParams = params.map(key => {
			if (input[key]) {
				return [key, input[key]];
			}

			return null;
		}).filter(x => x);

		if (queryParams.length !== 1) {
			return reject(new Error('Method `getSatellite` requires exactly one of `id`, `name`, or `noradId`'));
		}

		const [[inputKey, value]] = queryParams;
		const query = `query GetSatellite {system(${inputKey}:"${value}", missionId:${mission}){id name noradId}}`;

		makeGqlReq({ query })
			.then(result => {
				const system = get(result, 'data.data.system');

				if (!system) {
					return reject(new Error(`Could not find system with ${inputKey} ${value}`));
				}

				const { id, name, noradId } = system;

				resolve(new Satellite({ id, name, noradId, host, token, mission }));
			})
			.catch(err => reject(err));
	});

	/**
	 * @param {object} param0
	 * @param {Satellite} param0.system
	 * @param {string|Command} param0.command
	 * @param {string|number|Gateway} param0.gateway
	 * @param {object.<string, number|string>} param0.fields
	 * @returns {Promise<Command>}
	 */
	const createCommand = ({ system, command, fields = {}, gateway }) => new Promise((resolve, reject) => {
		const commandTypeStr = typeof command === 'string' ? command : command.commandType;

		if (!commandTypeStr) {
			throw new Error(
				'Method createCommand requires a `command` property that is either a string or a command definition'
			);
		}

		if (!system instanceof Satellite) {
			throw new Error('Method createCommand requires a `system` property that is a Satellite');
		}

		if (gateway && !(gateway instanceof Gateway || Number.isInteger(Number(gateway)))) {
			throw new Error(
				'The optional `gateway` property on method createCommand must be either an ID or a Gateway object'
			);
		}

		getCommandDefinitions(system)
			.then(defs => {
				const defMatch = defs.find(def => {
					return def.commandType === commandTypeStr;
				});

				if (!defMatch) {
					return reject(
						new Error(`Could not find command type ${commandTypeStr} in command definitions for system ${system.name}`)
					);
				}

				Object.entries(fields).forEach(([fieldName, fieldValue]) => {
					const fieldDef = JSON.parse(defMatch.fields).find(({ name }) => name === fieldName);
					const typeMatches = fieldDef && typesDoMatch(fieldValue, typeof fieldValue, fieldDef.type);

					if (!(fieldDef && typeMatches)) {
						const errStr = fieldDef
							? `Field ${fieldName} was given value ${fieldValue} which does not match the expected type ${fieldDef.type}`
							: `Command ${commandTypeStr} does not have a defined field ${fieldName}`;


						reject(new Error(errStr));
					}
				});

				const newCommand = new Command({ command: defMatch.id, system: system.id, fields });

				if (gateway) {
					newCommand.setGateway(gateway);
				}

				resolve(newCommand);
			})
			.catch(err => reject(err));
	});

	/**
	 * @param {Satellite} system
	 * @returns {Promise<CommandDefinition[]>}
	 */
	const getCommandDefinitions = system => new Promise((resolve, reject) => {
		if (!(system instanceof Satellite)) {
			throw new Error('Method getCommandDefinitions requires a Satellite argument');
		}

		const query = `
			query GetCommandDefinitions {
				system (id: ${system.id}) {
					commandDefinitions {
						nodes {
							id
							commandType
							fields
							displayName
							description
							tags
						}
					}
				}
			}
		`.trim();

		makeGqlReq({ query })
			.then(({ data }) => resolve(data.data.system.commandDefinitions.nodes))
			.catch(err => reject(err));
	});

	/**
	 * @param {Command} command
	 * @returns {Promise<Command>}
	 */
	const executeCommand = command => new Promise((resolve, reject) => {
		if (!command instanceof Command) {
			reject(new Error(`Method executeCommand requires a Command object`));
		}

		if (!command.gatewayId) {
			reject(new Error('Method executeCommand requires a Command object with a gatewayId set'));
		}

		const query = `
			mutation QueueAndExecute($systemId: ID!, $commandDefinitionId: ID!, $gatewayId: ID!, $fields: Json!) {
				queueAndExecuteCommand(input: { systemId: $systemId, commandDefinitionId: $commandDefinitionId, gatewayId: $gatewayId, fields: $fields }) {
					command {
						id
						state
					}
				}
			}
		`.trim();

		makeGqlReq({ query, variables: command.getVariables() })
			.then(({ data }) => {
				const { id, state } = data.data.queueAndExecuteCommand.command;

				command.setId(id);
				command.state = state;

				resolve(command);
			})
			.catch(err => reject(err));
	});

	/**
	 * Returns a Promise that will only resolve once the command has been updated to either "completed",
	 * "failed", or "cancelled" state in Major Tom. Relies on the Major Tom command state, and will
	 * reject if the command's state is not updated in Major Tom.
	 * @param {Command} command
	 * @param {number} [maxWaitTime]
	 * @returns {Promise<Command>}
	 */
	const executeAndCompleteCommand = (command, maxWaitTime = 90000) => new Promise((resolve, reject) => {
		if (!command instanceof Command) {
			reject(new Error(`Method executeCommand requires a Command object`));
		}

		if (!command.gatewayId) {
			reject(new Error('Method executeCommand requires a Command object with a gatewayId set'));
		}

		const commandId = command.id;
		const commandIsQueued = command.state === 'queued';
		const queueAndExecuteQuery = `
			mutation QueueAndExecute($systemId: ID!, $commandDefinitionId: ID!, $gatewayId: ID!, $fields: Json!) {
				queueAndExecuteCommand(input: { systemId: $systemId, commandDefinitionId: $commandDefinitionId, gatewayId: $gatewayId, fields: $fields }) {
					command {
						id
					}
				}
			}
		`.trim();
		const executeQuery = `
			mutation Queue($commandId: ID!) {
				executeCommand(input: { id: $commandId }) {
					command {
						id
						state
					}
				}
			}
		`.trim();
		const mutationName = commandIsQueued ? 'executeCommand' : 'queueAndExecuteCommand';
		const query = commandIsQueued ? executeQuery : queueAndExecuteQuery;
		let lastUpdateTime = Date.now();

		makeGqlReq({ query, variables: commandIsQueued ? { commandId } : command.getVariables() })
			.then(({ data }) => {
				const { id, state } = data.data[mutationName].command;

				if (!commandId) {
					command.setId(id);
				}

				if (FINAL_STATES.includes(state)) {
					return resolve(command.setFinalState(state));
				}

				const updateQuery = `
					query CommandState {
						command(id:${command.id}) {
							state
						}
					}
				`.trim();

				setInterval(() => {
					if (Date.now() - lastUpdateTime > maxWaitTime) {
						reject(
							new Error(
								`Command ${command.id} did not complete within the maximum wait time of ${(maxWaitTime / 1000).toFixed(1)} seconds`
							)
						);
					} else {
						makeGqlReq({ query: updateQuery })
							.then(({ data }) => {
								const { state } = data.data.command;

								if (state !== command.state) {
									command.state = state;
									lastUpdateTime = Date.now();
								}

								if (FINAL_STATES.includes(state)) {
									return resolve(command.setFinalState(state));
								}
							})
							.catch(err => reject(err));
					}
				}, 1000);
			})
			.catch(err => {
				reject(err);
			});
	});

	/**
	 * @param {object} param0
	 * @param {string} param0.name
	 * @param {string|number} param0.id
	 * @returns {Promise<Gateway>}
	 */
	const getGateway = ({ name: gatewayName, id }) => new Promise((resolve, reject) => {
		if (!(gatewayName || id)) {
			reject(new Error('Method getGateway requires either a `name` or `id` property'));
		}

		const query = `
			query GetGateway {
				gateway(${id ? `id:${id}` : `name:"${gatewayName}", missionId:${mission}`}) {
					id
					name
					disabledAt
					disablingUser {
						name
						email
					}
					connected
				}
			}
		`.trim();

		makeGqlReq({ query })
			.then(({ data }) => {
				const gateway = get(data, 'data.gateway');

				if (!gateway) {
					return reject(
						new Error(`Could not find gateway with ${id ? `ID ${id}` : `name ${gatewayName}`}`)
					);
				}

				resolve(new Gateway(gateway, { host, token, mission }));
			})
			.catch(err => reject(err));
	});

	/**
	 * @param {Command} command
	 * @returns {Promise<Command>}
	 */
	const queueCommand = command => new Promise((resolve, reject) => {
		if (!command instanceof Command) {
			reject(new Error(`Method executeCommand requires a Command object`));
		}

		if (!command.gatewayId) {
			reject(new Error('Method executeCommand requires a Command object with a gatewayId set'));
		}

		const query = `
			mutation Queue($systemId: ID!, $commandDefinitionId: ID!, $gatewayId: ID!, $fields: Json!) {
				queueCommand(input: { systemId: $systemId, commandDefinitionId: $commandDefinitionId, gatewayId: $gatewayId, fields: $fields }) {
					command {
						id
						state
					}
				}
			}
		`.trim();

		makeGqlReq({ query, variables: command.getVariables() })
			.then(({ data }) => {
				const { id, state } = data.data.queueCommand.command;

				command.setId(id);

				if (state === 'queued') {
					command.setIsQueued();
				}

				resolve(command);
			})
			.catch(err => reject(err));
	});

	/**
	 * Execute an Array of commands, only beginning the next after the first has resolved. Depends
	 * on the Major Tom command 'status' field. Use the optional second argument object to indicate
	 * the max time for a command to resolve. Options also may indicate that the sequence should
	 * continue even if commands do not resolve to a 'completed' state. If 'continuePastFailures' is
	 * true, then this will always resolve the updated Array of commands. If false (default), the
	 * Promise will reject with the Array of only the commands that were executed, including the
	 * command that did not succeed as the last element.
	 * @param {Command|Command[]} commandsArr
	 * @param {object} [options]
	 * @param {number} options.maxWaitTime
	 * @param {boolean} options.continuePastFailures
	 * @returns {Promise<Command[]>}
	 */
	const executeCommandsInSequence = (
		commandsArr,
		{ maxWaitTime = 90000, continuePastFailures = false } = {}
	) => new Promise(async (resolve, reject) => {
		const workingCommands = Array.isArray(commandsArr) ? [...commandsArr] : [commandsArr];
		const resolvedCommands = [];
		let current;

		while (workingCommands.length) {
			try {
				current = workingCommands.shift();

				const resolved = await executeAndCompleteCommand(current, maxWaitTime);

				resolvedCommands.push(resolved);

				if (resolved.finalState !== 'completed' && !continuePastFailures) {
					return reject(resolvedCommands);
				}
			} catch (err) {
				current.setFinalState('timed_out');

				resolvedCommands.push(current);

				if (!continuePastFailures) {
					return reject(resolvedCommands);
				}
			}
		}

		resolve(resolvedCommands);
	});

	getMissionId();

	const surface = {
		getMissionId,
		getSatellite,
		getCommandDefinitions,
		createCommand,
		executeCommand,
		getGateway,
		queueCommand,
		executeAndCompleteCommand,
		executeCommandsInSequence,
	};

	return surface;
};

module.exports = mts;

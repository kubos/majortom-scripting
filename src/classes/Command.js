class Command {
	constructor({ command, system, fields, id, ...rest }) {
		this.systemId = system;
		this.commandDefinitionId = command;
		this.fields = JSON.stringify(fields || {});
		this.gatewayId = null;
		this.id = id;
		this.state = rest.state;

		['status', 'output', 'payload'].forEach(function(readOnlyKey) {
			this.__defineGetter__(readOnlyKey, () => rest[readOnlyKey]);
		}.bind(this));
	}

	/**
	 * @param {number|Gateway} gatewayId
	 * @returns {Command}
	 */
	setGateway(gatewayId) {
		if (Number.isInteger(Number(gatewayId))) {
			this.gatewayId = gatewayId;
		} else if (gatewayId && gatewayId.id) {
			this.gatewayId = gatewayId.id;
		} else {
			throw new Error('Method Command.setGateway must be given either a numerical ID or a Gateway object');
		}

		return this;
	}

	setIsQueued() {
		this.state = 'queued';

		return this;
	}

	setId(id) {
		this.id = id;

		return this;
	}

	/**
	 * @param {'completed'|'failed'|'cancelled'|'timed_out'} state
	 */
	setFinalState(state) {
		this.finalState = state;

		return this;
	}

	toString() {
		const cmdStr =
			`systemId:${this.systemId} commandDefinitionId:${this.commandDefinitionId} fields:"${this.fields}" gatewayId:${this.gatewayId}`;

		return cmdStr;
	}

	getVariables() {
		return {
			systemId: this.systemId,
			commandDefinitionId: this.commandDefinitionId,
			fields: this.fields,
			gatewayId: this.gatewayId,
		};
	}
}

module.exports = Command;

class Pass {
	constructor(passObj) {
		const baseParams = ['id', 'duration', 'start', 'end', 'groundStationId', 'satelliteId', 'scheduledStatus'];
		const { host, token } = passObj;

		baseParams.forEach(param => {
			if (!passObj[param]) {
				throw new Error(`Cannot instantiate Pass: property \`${param}\` is required`);
			}

			this[param] = passObj[param];
		});

		this.makeReq = query => makeGqlReq(host, token, query);
		this.credentials = () => ({ host, token });
	}
}

module.exports = Pass;

const crypto = require('crypto');
const EventEmitter = require('events');
const { Writable } = require('stream');
const axios = require('axios');

class AxiosPacer extends Writable {
	constructor(host, headers) {
		console.log('constructing a pacer class');
		super({ objectMode: true });
		this.headers = headers;
		this.host = host;
		this.nextSend = Date.now();
	}

	setCxProps(host, headers) {
		this.host = host;
		this.headers = headers;
	}

	_write(writeObj, _, next) {
		const now = Date.now();
		const { id, body } = writeObj;

		if (now > this.nextSend) {
			this.interact(id, body, next);
		} else {
			setTimeout(() => {
				this.interact(id, body, next);
			}, this.nextSend - now);
		}
	}

	interact(id, body, done) {
		axios.post(`https://${this.host}/script_api/v1/graphql`, body, { headers: this.headers })
			.then(response => {
				this.emit(id, null, response);
				done();
			})
			.catch(err => {
				const { status, data } = err.response || {};

				if (status === 420 && data && data.retryAfter) {
					const waitMs = data.retryAfter * 1000;

					this.nextSend = Date.now() + waitMs;

					setTimeout(() => {
						this.interact(id, body, done);
					}, waitMs);
				} else {
					console.error(err);
					this.emit(id, err);
					done();
				}
			});
	}
}

const makeGqlReq = (host, token) => body => {
	const headers = {
		'X-Script-Token': token,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};

	return axios.post(`https://${host}/script_api/v1/graphql`, body, { headers });
};

const pacer = new AxiosPacer();

const bakeGqlReq = (host, token) => {
	const headers = {
		'X-Script-Token': token,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};

	pacer.setCxProps(host, headers);

	return body => new Promise((resolve, reject) => {
		const myReq = crypto.randomUUID();

		pacer.on(myReq, (error, response) => {
			if (error) {
				reject(error);
			} else {
				resolve(response);
			}
		});

		pacer.write({ id: myReq, body });
	});
};

module.exports = bakeGqlReq;

const crypto = require('crypto');
const EventEmitter = require('events');
const { Writable } = require('stream');
const axios = require('axios');

class AxiosPacer extends Writable {
	constructor(host, headers) {
		super({ objectMode: true });
		this.headers = headers;
		this.host = host;
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
					setTimeout(() => {
						this.interact(id, body, done);
					}, data.retryAfter * 1000);
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

const bakeGqlReq = (host, token) => {
	const headers = {
		'X-Script-Token': token,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
	const pacer = new AxiosPacer(host, headers);

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

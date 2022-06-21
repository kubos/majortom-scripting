/**
 * @param {unknown} value
 * @param {string} jsType
 * @param {string} fieldType
 */
const typesDoMatch = (value, jsType, fieldType) => {
	switch (jsType) {
		case 'number': {
			if (['number', 'integer', 'float', 'datetime', 'enum'].includes(fieldType)) {
				return true;
			}

			if (fieldType === 'boolean' && [0, 1].includes(value)) {
				return true;
			}

			return false;
		}
		case 'string': {
			return ['string', 'text'].includes(fieldType);
		}
		default:
			return false;
	}
};

module.exports = typesDoMatch;

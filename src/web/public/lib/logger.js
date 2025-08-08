const { stamp } = require("./time");

const log = (msg, ...rest) => console.log(stamp(msg), ...rest);
const error = (msg, ...rest) => console.error(stamp(msg), ...rest);

module.exports = { log, error };

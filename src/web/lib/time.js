const dayjs = require("dayjs");

const format = (date = new Date(), fmt = "YYYY-MM-DD HH:mm:ss") =>
  dayjs(date).format(fmt);

const ts = (date = new Date()) => format(date, "YYYY-MM-DD HH:mm:ss");
const stamp = (s) => `[${ts()}] ${s}`;

module.exports = { format, ts, stamp };

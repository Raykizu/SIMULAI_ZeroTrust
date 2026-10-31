const config = require('../config');

function jamSekarang(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function dalamJamAkses(date = new Date()) {
  const jam = jamSekarang(date);
  return jam >= config.accessStartHour && jam < config.accessEndHour;
}

function labelJamAkses() {
  const format = (value) => `${String(value).padStart(2, '0')}.00`;
  return `${format(config.accessStartHour)}-${format(config.accessEndHour)}`;
}

module.exports = { dalamJamAkses, labelJamAkses };

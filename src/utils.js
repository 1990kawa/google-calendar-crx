let utils = {};

utils.fromIso8601 = date => {
  if (!date) {
    return null;
  }

  return moment(date);
};

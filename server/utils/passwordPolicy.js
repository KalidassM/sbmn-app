function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 72) return 'Password must be at most 72 characters';
  return null;
}

module.exports = { checkPassword };

"use strict";

const USER_INFO_FIELD_LIMITS = { id: 256, userId: 256, email: 512, nickname: 1024, avatar: 8192, userType: 64 };

function copySafeUserInfoFields(source) {
  const result = {};
  Object.keys(USER_INFO_FIELD_LIMITS).forEach(function (key) {
    const value = source[key];
    const limit = USER_INFO_FIELD_LIMITS[key];
    if ((key === "id" || key === "userId") && typeof value === "number" && isFinite(value)) result[key] = value;
    else if (typeof value === "string" && value.length <= limit) result[key] = value;
  });
  return result;
}

function sanitizeUserInfo(value, allowIdOnly) {
  if (!value || typeof value !== "object") return null;
  const candidates = [value];
  if (value.data && typeof value.data === "object") candidates.push(value.data);
  if (value.result && typeof value.result === "object") candidates.push(value.result);
  for (let i = 0; i < candidates.length; i++) {
    const result = copySafeUserInfoFields(candidates[i]);
    if (result.email || result.userId || result.nickname || (allowIdOnly && result.id !== undefined)) return result;
  }
  return null;
}

function sanitizeTrustedUserInfo(value) {
  return sanitizeUserInfo(value, true);
}

module.exports = {
  sanitizeUserInfo: sanitizeUserInfo,
  sanitizeTrustedUserInfo: sanitizeTrustedUserInfo,
};

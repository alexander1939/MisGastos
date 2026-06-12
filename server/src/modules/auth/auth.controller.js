const service = require('./auth.service');

const REFRESH_COOKIE = 'refresh_token';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.register(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.status(201).json({ user, accessToken });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.json({ user, accessToken });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) await service.logout(token);
    res.clearCookie(REFRESH_COOKIE);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: 'No refresh token' });
    const { accessToken } = await service.refresh(token);
    res.json({ accessToken });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const user = await service.getMe(req.userId);
    res.json(user);
  } catch (err) { next(err); }
}

async function updateMe(req, res, next) {
  try {
    const user = await service.updateMe(req.userId, req.body);
    res.json(user);
  } catch (err) { next(err); }
}

async function deleteMe(req, res, next) {
  try {
    await service.deleteMe(req.userId);
    res.clearCookie(REFRESH_COOKIE);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { register, login, logout, refreshToken, me, updateMe, deleteMe };

import jwt from 'jsonwebtoken';
import config from '../config/env.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export default { signToken, verifyToken };

// middleware/staffAuth.js
const jwt = require('jsonwebtoken');

const ALLOWED_STAFF_ROLES = ['frontdesk', 'security', 'fnb'];

const staffAuthenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Staff access denied.' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!ALLOWED_STAFF_ROLES.includes(decoded.role)) {
      return res.status(403).json({ success: false, message: 'Staff token required.' });
    }
    req.staff = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = { staffAuthenticate };

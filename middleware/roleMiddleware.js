const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Access denied. No user found." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Insufficient permissions." });
    }

    next();
  };
};

const superuserOnly = roleMiddleware(["superuser"]);
const adminAndSuperuser = roleMiddleware(["admin", "superuser"]);

module.exports = {
  roleMiddleware,
  superuserOnly,
  adminAndSuperuser,
};

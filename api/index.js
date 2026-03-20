const app = require('../backend/server');

module.exports = (req, res) => {
  const pathParam = req.query?.path;
  const resolvedPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;

  if (resolvedPath) {
    const query = { ...req.query };
    delete query.path;

    const search = new URLSearchParams(query).toString();
    req.url = `/api/${resolvedPath}${search ? `?${search}` : ''}`;
  }

  return app(req, res);
};

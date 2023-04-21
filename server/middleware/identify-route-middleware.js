// via https://gitlab.com/gitterHQ/env/-/blob/2a184afea5dc5f4db478d651b3597001474ee932/lib/middlewares/identify-route.js
function identifyRouteMiddleware(routeName) {
  return function identifyRoute(req, res, next) {
    req.routeIdentifier = routeName;
    next();
  };
}

export default identifyRouteMiddleware;

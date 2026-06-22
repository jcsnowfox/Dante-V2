const { parseRequestForm } = require("../adminRequestUtils");
const { handleGameAdminActions } = require("../../games/http/gameAdminPageHandler");

async function handleGameActions({ req, res, url, context, withAdmin }) {
  if (req.method !== "POST") return false;
  if (!url.pathname.startsWith("/admin/games/")) return false;

  return withAdmin(async (innerReq, innerRes, innerContext) => {
    const { fields } = await parseRequestForm(innerReq);
    await handleGameAdminActions({
      req: innerReq,
      body: fields,
      innerContext,
      redirect: (path) => {
        innerRes.writeHead(302, { Location: path });
        innerRes.end();
      },
      logger: innerContext.logger,
    });
  })(req, res, context);
}

module.exports = { handleGameActions };

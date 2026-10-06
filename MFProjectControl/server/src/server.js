const { createApp, autoSnapshots } = require('./app');
const port = Number(process.env.PORT) || 4000;
const app = createApp();
app.listen(port, () => console.log(`MF Project Control server on http://localhost:${port}`));
try { autoSnapshots(); } catch (e) { console.error(e); }
setInterval(() => { try { autoSnapshots(); } catch (e) { console.error(e); } }, 6 * 3600 * 1000);

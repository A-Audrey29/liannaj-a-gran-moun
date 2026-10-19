import "dotenv/config";
// Doit rester le premier import applicatif : valide toute la configuration
// avant que le moindre module ne lise process.env.
import { env } from "./env";
import { createServer } from "http";
import { createApp, log } from "./app";
import { serveStatic } from "./static";
import { checkAndSendFeedbackReminders } from "./lib/feedback-reminder";
import { checkAndSendMeetingCheckReminders } from "./lib/meeting-check-reminder";
import { checkAndSendAvailabilityReminders } from "./lib/availability-reminder";

const RAPPEL_FEEDBACK_INTERVALLE_MS = 6 * 60 * 60 * 1000;
const RAPPEL_MEETING_CHECK_INTERVALLE_MS = 6 * 60 * 60 * 1000;
const RAPPEL_DISPONIBILITES_INTERVALLE_MS = 6 * 60 * 60 * 1000;

(async () => {
  // Le serveur HTTP est cree avant l'app car registerRoutes en a besoin pour
  // les flux SSE. L'app lui est branchee comme gestionnaire juste apres.
  const httpServer = createServer();
  const app = await createApp(httpServer);
  httpServer.on("request", app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  httpServer.listen(
    {
      port: env.PORT,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${env.PORT}`);
      setInterval(checkAndSendFeedbackReminders, RAPPEL_FEEDBACK_INTERVALLE_MS);
      checkAndSendFeedbackReminders();
      setInterval(checkAndSendMeetingCheckReminders, RAPPEL_MEETING_CHECK_INTERVALLE_MS);
      checkAndSendMeetingCheckReminders();
      setInterval(() => checkAndSendAvailabilityReminders(), RAPPEL_DISPONIBILITES_INTERVALLE_MS);
      checkAndSendAvailabilityReminders();
    },
  );
})();

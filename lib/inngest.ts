import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "nichalo",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

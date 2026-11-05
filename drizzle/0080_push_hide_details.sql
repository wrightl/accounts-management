-- Per person and company: push alerts carry no title or body text, so nothing shows on a locked phone.
ALTER TABLE "user_notification_preferences" ADD COLUMN "hide_push_details" boolean DEFAULT false NOT NULL;

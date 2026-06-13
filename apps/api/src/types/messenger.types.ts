/**
 * Facebook Messenger Webhook payload types.
 * @see https://developers.facebook.com/docs/messenger-platform/webhooks
 */

export interface MessengerWebhookPayload {
  object: "page";
  entry: MessengerWebhookEntry[];
}

export interface MessengerWebhookEntry {
  id: string; // Facebook Page ID — primary routing key
  time: number;
  messaging?: MessengerMessagingEvent[];
}

export interface MessengerMessagingEvent {
  sender: { id: string }; // PSID
  recipient: { id: string }; // Page ID
  timestamp: number;
  message?: IncomingMessage;
  delivery?: DeliveryEvent;
  read?: ReadEvent;
  postback?: PostbackEvent;
}

export interface IncomingMessage {
  mid: string;
  text?: string;
  attachments?: MessageAttachment[];
  sticker_id?: number;
  quick_reply?: { payload: string };
}

export interface MessageAttachment {
  type: "image" | "audio" | "video" | "file" | "fallback" | "location" | "template";
  payload: {
    url?: string;
    sticker_id?: number;
    coordinates?: { lat: number; long: number };
    title?: string;
  };
}

export interface DeliveryEvent {
  mids?: string[];
  watermark: number;
}

export interface ReadEvent {
  watermark: number;
}

export interface PostbackEvent {
  title: string;
  payload: string;
  mid?: string;
}

export interface PageContext {
  pageDbId: string;
  pageId: string;
  tenantId: string;
  pageAccessToken: string;
  pageName: string;
}

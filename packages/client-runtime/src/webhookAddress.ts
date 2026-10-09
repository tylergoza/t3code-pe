import type { ScheduledTaskWebhookEndpoint } from "@t3tools/contracts";
import { isLocalLoopbackHost } from "@t3tools/shared/hostClassification";

/**
 * Where a sender can call a webhook task, as a client shows it: the endpoint
 * path resolved on the address this client reaches the environment at.
 */
export interface WebhookAddress {
  /** The URL to give a sender, or the bare path when no address is known. */
  readonly address: string;
  /** Whether `address` is a full URL a sender can call. */
  readonly copyable: boolean;
  /** One line on who can reach `address`. */
  readonly note: string | null;
}

export function webhookAddress(
  endpoint: ScheduledTaskWebhookEndpoint,
  httpBaseUrl: string | null,
): WebhookAddress {
  if (httpBaseUrl === null) {
    return {
      address: endpoint.path,
      copyable: false,
      note: "No address is known for this environment yet.",
    };
  }
  const url = new URL(endpoint.path, httpBaseUrl);
  return {
    address: url.href,
    copyable: true,
    note: isLocalLoopbackHost(url.hostname)
      ? "Only this computer can call this address."
      : "Works wherever this environment's address is reachable, for example behind your own proxy.",
  };
}

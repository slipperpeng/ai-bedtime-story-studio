interface ProtocolRegistration {
  isProtocolHandled(scheme: string): boolean
  unhandle(scheme: string): void
}

export function clearProtocolHandlerIfRegistered(
  protocol: ProtocolRegistration,
  scheme: string,
): void {
  if (protocol.isProtocolHandled(scheme)) protocol.unhandle(scheme)
}

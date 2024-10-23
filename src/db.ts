export interface KnoxTables {
  keys: {
    pubkey: string;
    seckey_enc: Uint8Array;
    iv: Uint8Array;
    inserted_at: Date;
  };
  connections: {
    id: number;
    pubkey: string;
    app_pubkey: string;
    signer_pubkey: string;
    signer_seckey_enc: Uint8Array;
    iv: Uint8Array;
    relays: string[];
    message: string;
    expires_at: Date | null;
    inserted_at: Date;
  };
  logs: {
    type: string;
    data: object;
    inserted_at: Date;
  };
}

// knox add alex
// knox generate alex
// knox rename alex yolo
// knox remove yolo
// knox list
// knox uri alex
// knox uri cobrafuma -m "Daniel's laptop" --filter '{"kinds":[0,1,3]}'
// knox uri cobrafuma -m "Daniel's laptop" --filter '{"kinds":[0,1,3]}' --expires 2021-12-31
// knox revoke
// knox connections
// knox disconnect 23
// knox export
// knox import
// knox start

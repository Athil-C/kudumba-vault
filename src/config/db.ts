import mongoose from 'mongoose';

export interface DatabaseStatus {
  connected: boolean;
  isMock: boolean;
  sanitizedUri: string;
  error?: string;
}

/**
 * Strips credentials and sensitive query tokens from MongoDB connection strings for safe logging.
 */
export function sanitizeMongoUri(uri?: string): string {
  if (!uri) return 'undefined';
  try {
    // Handle standard mongodb:// or mongodb+srv://
    return uri.replace(
      /(mongodb(?:\+srv)?:\/\/)([^:@]+):([^@]+)@/i,
      '$1***:***@'
    );
  } catch {
    return 'mongodb+srv://[redacted]';
  }
}

let isConnected = false;
let isMockStorage = false;
let lastError: string | undefined;
let connectionPromise: Promise<DatabaseStatus> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    isConnected = true;
    isMockStorage = false;
    lastError = undefined;
    console.log('[MongoDB] Connection state: Connected.');
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Connection state: Disconnected. Background reconnect will retry...');
  });

  mongoose.connection.on('error', (err) => {
    lastError = err?.message || String(err);
    console.error('[MongoDB] Connection error event:', lastError);
    if (lastError && (lastError.includes('alert number 80') || lastError.includes('tlsv1 alert internal error'))) {
      console.warn(
        '[MongoDB] Atlas TLS Alert 80 Notice: Atlas terminated the TLS handshake. Typical causes:\n' +
        '  1. Current public IP is not yet active in MongoDB Atlas Network Access whitelist (add 0.0.0.0/0 to test).\n' +
        '  2. The Atlas cluster is paused (check cloud.mongodb.com and resume).\n' +
        '  3. Dual-stack IPv6 / CGNAT routing mismatch (family: 4 enforces IPv4 connection).'
      );
    }
  });
}

/**
 * Connects to MongoDB Atlas using MONGODB_URI.
 *
 * Rules:
 * - Production: If MONGODB_URI is missing or unreachable, startup throws immediately. No silent fallback.
 * - Test / Explicit Mock: Only if NODE_ENV === 'test' or ALLOW_MOCK_DB === 'true' can mock mode activate.
 * - Local Dev: Warns clearly if no URI is provided or connection times out, without exposing secrets.
 */
export async function connectDatabase(): Promise<DatabaseStatus> {
  // If a connection attempt is currently in flight, reuse the promise to prevent concurrent collisions
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const uri = process.env.MONGODB_URI?.trim();
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProd = nodeEnv === 'production';
    const isTest =
      nodeEnv === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      process.execArgv.includes('--test');
    const allowMock = !isProd && (process.env.ALLOW_MOCK_DB === 'true' || isTest);

    registerConnectionListeners();

    // 1. Missing URI handling
    if (!uri) {
      if (isProd) {
        const errMsg = '[MongoDB] Production startup aborted: MONGODB_URI is required.';
        console.error(errMsg);
        throw new Error(errMsg);
      }

      if (allowMock) {
        isMockStorage = true;
        isConnected = false;
        console.warn('[MongoDB] No MONGODB_URI provided. Running with explicitly permitted in-memory/mock storage for test.');
        return {
          connected: false,
          isMock: true,
          sanitizedUri: 'mock-memory',
        };
      }

      const warnMsg = '[MongoDB] No MONGODB_URI provided. Set MONGODB_URI in .env to connect to MongoDB Atlas.';
      console.warn(warnMsg);
      lastError = 'Missing MONGODB_URI';
      return {
        connected: false,
        isMock: false,
        sanitizedUri: 'none',
        error: warnMsg,
      };
    }

    // 2. Attempt real MongoDB connection
    const sanitized = sanitizeMongoUri(uri);
    try {
      // If already connected, reuse
      if (mongoose.connection.readyState === 1) {
        isConnected = true;
        isMockStorage = false;
        return {
          connected: true,
          isMock: false,
          sanitizedUri: sanitized,
        };
      }

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 20000,
        family: 4,
      });

      isConnected = true;
      isMockStorage = false;
      lastError = undefined;
      console.log(`[MongoDB] Connected successfully to ${sanitized}`);

      return {
        connected: true,
        isMock: false,
        sanitizedUri: sanitized,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastError = errorMsg;
      isConnected = false;

      console.error(`[MongoDB] Connection failed to ${sanitized}: ${errorMsg}`);

      // In production, connection failure MUST abort startup
      if (isProd) {
        throw new Error(`[MongoDB] Production database connection failed: ${errorMsg}`);
      }

      // In test environment with explicit mock permission, allow fallback
      if (allowMock) {
        console.warn('[MongoDB] Falling back to mock storage in test environment.');
        isMockStorage = true;
        return {
          connected: false,
          isMock: true,
          sanitizedUri: sanitized,
          error: errorMsg,
        };
      }

      return {
        connected: false,
        isMock: false,
        sanitizedUri: sanitized,
        error: errorMsg,
      };
    }
  })().finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
}

/**
 * Ensures MongoDB is connected before running an authoritative operation.
 * If disconnected, triggers a graceful reconnect attempt instead of crashing immediately.
 */
export async function ensureDatabaseConnected(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  if (connectionPromise) {
    const res = await connectionPromise;
    return res.connected;
  }
  const status = await connectDatabase();
  return status.connected;
}

/**
 * Starts a background periodic auto-reconnect daemon.
 * If the connection is lost (e.g. sleep/wake, Wi-Fi reconnection, network blip),
 * retries connection every intervalMs without crashing the server.
 */
export function startAutoReconnectDaemon(intervalMs = 10000): void {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    if (mongoose.connection.readyState === 0 && !isConnected && !connectionPromise) {
      try {
        await connectDatabase();
      } catch {
        // Handled inside connectDatabase
      }
    }
  }, intervalMs);
  if (reconnectTimer.unref) {
    reconnectTimer.unref();
  }
}

/**
 * Returns current database connectivity status.
 */
export function getDatabaseStatus(): DatabaseStatus {
  const ready = mongoose.connection.readyState === 1;
  const uri = process.env.MONGODB_URI?.trim();
  return {
    connected: ready || isConnected,
    isMock: isMockStorage,
    sanitizedUri: sanitizeMongoUri(uri),
    error: lastError,
  };
}

/**
 * Disconnects from MongoDB gracefully.
 */
export async function disconnectDatabase(): Promise<void> {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
  isMockStorage = false;
}


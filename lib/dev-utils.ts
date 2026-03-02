// Development utilities for Smart Wallets app
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Enhanced error handler with better debugging info
 */
export function createApiErrorHandler(routeName: string) {
  return (fn: Function) => {
    return async (req: NextRequest, ...args: any[]) => {
      const startTime = Date.now();
      const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
      
      try {
        logger.info(`[${routeName}] ${req.method}`, { requestId });
        const result = await fn(req, ...args);
        const duration = Date.now() - startTime;
        logger.info(`[${routeName}] Completed`, { duration, requestId });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[${routeName}] Failed`, { duration, requestId, err: error instanceof Error ? error : String(error) });
        
        if (error instanceof Response) {
          return error;
        }
        
        return NextResponse.json(
          { 
            error: "Internal server error",
            requestId,
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        );
      }
    };
  };
}

/**
 * Quick health check utility
 */
export async function getSystemHealth() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    env: process.env.NODE_ENV
  };
}

/**
 * Database connection tester
 */
export async function testDbConnection() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1 as test`;
    await prisma.$disconnect();
    return { status: "connected", timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: "error", 
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };
  }
}
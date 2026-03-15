class PrismaClientKnownRequestError extends Error {
  code: string;
  clientVersion: string;

  constructor(message: string, options: { code: string; clientVersion: string }) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = options.code;
    this.clientVersion = options.clientVersion;
  }
}

function createDeepMock(): any {
  return new Proxy(
    () => undefined,
    {
      apply: async () => undefined,
      get: (_target, prop) => {
        if (prop === "then") {
          return undefined;
        }
        return createDeepMock();
      },
    }
  );
}

export const UserStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;

export const RequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const InstallmentFrequency = {
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  CUSTOM: "CUSTOM",
} as const;

export const TransactionType = {
  SEND: "SEND",
  RECEIVE: "RECEIVE",
  WITHDRAW: "WITHDRAW",
  CONVERT: "CONVERT",
  BUY: "BUY",
} as const;

export const BillPaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  SCHEDULED: "SCHEDULED",
} as const;

export const SubscriptionStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
} as const;

export const SubscriptionTier = {
  FREE: "FREE",
  BASIC: "BASIC",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE",
} as const;

export const HealthReminderStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  COMPLETED: "COMPLETED",
} as const;

export const HealthTransactionStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const GiftCardStatus = {
  ACTIVE: "ACTIVE",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
} as const;

export const TransactionStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

class Decimal {
  private value: number;

  constructor(value: string | number | bigint | Decimal) {
    let parsed: number;
    
    if (value instanceof Decimal) {
      parsed = value.value;
    } else if (typeof value === "string") {
      parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed) || value.trim() === "") {
        throw new Error(`Cannot parse "${value}" as a Decimal`);
      }
    } else if (typeof value === "bigint") {
      parsed = Number(value);
    } else {
      parsed = value;
      if (Number.isNaN(parsed)) {
        throw new Error(`Cannot parse NaN as a Decimal`);
      }
    }
    
    this.value = parsed;
  }

  toNumber(): number {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }

  lte(other: Decimal | number): boolean {
    const otherVal = typeof other === "number" ? other : other.value;
    return this.value <= otherVal;
  }

  lt(other: Decimal | number): boolean {
    const otherVal = typeof other === "number" ? other : other.value;
    return this.value < otherVal;
  }

  plus(other: Decimal | number): Decimal {
    const otherVal = typeof other === "number" ? other : other.value;
    return new Decimal(this.value + otherVal);
  }

  times(other: Decimal | number): Decimal {
    const otherVal = typeof other === "number" ? other : other.value;
    return new Decimal(this.value * otherVal);
  }

  div(other: Decimal | number): Decimal {
    const otherVal = typeof other === "number" ? other : other.value;
    return new Decimal(this.value / otherVal);
  }
}

export const Prisma = {
  PrismaClientKnownRequestError,
  Decimal,
};

export class PrismaClient {
  constructor(_options?: unknown) {
    return createDeepMock();
  }
}
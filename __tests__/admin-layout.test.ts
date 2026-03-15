import AdminLayout from "@/app/admin/layout";

const React = require("react");
const TestRenderer = require("react-test-renderer");
const { act } = TestRenderer;

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, href, ...props }: any) => React.createElement("a", { href, ...props }, children),
  };
});

jest.mock("@/components/ui/button", () => {
  const React = require("react");
  return {
    Button: ({ children, ...props }: any) => React.createElement("button", props, children),
  };
});

jest.mock("@/components/ui/card", () => {
  const React = require("react");
  return {
    Card: ({ children, ...props }: any) => React.createElement("div", props, children),
    CardContent: ({ children, ...props }: any) => React.createElement("div", props, children),
    CardHeader: ({ children, ...props }: any) => React.createElement("div", props, children),
    CardTitle: ({ children, ...props }: any) => React.createElement("div", props, children),
    CardDescription: ({ children, ...props }: any) => React.createElement("div", props, children),
  };
});

jest.mock("lucide-react", () => {
  const React = require("react");
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        return ({ children, ...props }: any) =>
          React.createElement("svg", { ...props, "data-icon": String(key) }, children);
      },
    }
  );
});

function flattenText(node: any): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  return flattenText(node.children);
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("Admin layout", () => {
  let fetchMock: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;
  let originalConsoleError: typeof console.error;
  let sessionStorageMock: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    originalConsoleError = console.error;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation((message?: unknown, ...args: unknown[]) => {
      const firstArg = typeof message === "string" ? message : "";
      if (firstArg.includes("react-test-renderer is deprecated")) {
        return;
      }
      if (firstArg.includes("The current testing environment is not configured to support act")) {
        return;
      }
      return originalConsoleError(message as any, ...args);
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    sessionStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };

    Object.defineProperty(global, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
    });
  });

  test("checks the admin cookie on mount and shows the login gate when unauthorized", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AdminLayout, null, React.createElement("div", null, "SECRET_PANEL"))
      );
    });
    await flushEffects();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/stats", { credentials: "include" });
    expect(sessionStorageMock.getItem).not.toHaveBeenCalled();

    const text = flattenText(renderer.toJSON());
    expect(text).toContain("Admin Access Only");
    expect(text).not.toContain("SECRET_PANEL");
  });

  test("renders children when the admin cookie is valid", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AdminLayout, null, React.createElement("div", null, "SECRET_PANEL"))
      );
    });
    await flushEffects();

    const text = flattenText(renderer.toJSON());
    expect(text).toContain("Admin Console");
    expect(text).toContain("SECRET_PANEL");
  });

  test("promotes the user into the admin console after successful login", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AdminLayout, null, React.createElement("div", null, "SECRET_AFTER_LOGIN"))
      );
    });
    await flushEffects();

    const input = renderer.root.findByType("input");
    act(() => {
      input.props.onChange({ target: { value: "admin2026" } });
    });

    const submitButton = renderer.root.findAllByType("button").find((node: any) => {
      return flattenText(node.props.children).includes("Enter Admin Console");
    });

    expect(submitButton).toBeDefined();

    await act(async () => {
      await submitButton.props.onClick();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "admin2026" }),
    });

    const text = flattenText(renderer.toJSON());
    expect(text).toContain("SECRET_AFTER_LOGIN");
  });

  test("logs out by clearing the admin session cookie on the server", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AdminLayout, null, React.createElement("div", null, "SECRET_PANEL"))
      );
    });
    await flushEffects();

    const logoutButton = renderer.root.findAllByType("button").find((node: any) => {
      return flattenText(node.props.children).includes("Sign Out");
    });

    expect(logoutButton).toBeDefined();

    await act(async () => {
      await logoutButton.props.onClick();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/login", { method: "DELETE" });

    const text = flattenText(renderer.toJSON());
    expect(text).toContain("Admin Access Only");
    expect(text).not.toContain("SECRET_PANEL");
  });
});
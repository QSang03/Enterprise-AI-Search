import { ensureHrefProtocol, transformLinkUri } from "./utils";

describe("ensureHrefProtocol", () => {
  it("adds https protocol to bare domains", () => {
    expect(ensureHrefProtocol("anthropic.com")).toBe("https://anthropic.com");
  });

  it("preserves links that already include a protocol", () => {
    expect(ensureHrefProtocol("https://anthropic.com")).toBe(
      "https://anthropic.com"
    );
    expect(ensureHrefProtocol("mailto:support@anthropic.com")).toBe(
      "mailto:support@anthropic.com"
    );
  });

  it("converts bare email addresses to mailto links", () => {
    expect(ensureHrefProtocol("support@anthropic.com")).toBe(
      "mailto:support@anthropic.com"
    );
  });
});

describe("transformLinkUri", () => {
  it("allows safe protocols", () => {
    expect(transformLinkUri("https://anthropic.com")).toBe(
      "https://anthropic.com"
    );
    expect(transformLinkUri("mailto:support@anthropic.com")).toBe(
      "mailto:support@anthropic.com"
    );
  });

  it("converts bare email addresses to mailto links", () => {
    expect(transformLinkUri("support@anthropic.com")).toBe(
      "mailto:support@anthropic.com"
    );
  });

  it("blocks unsafe protocols", () => {
    expect(transformLinkUri("javascript:alert(1)")).toBeNull();
  });

  it("allows smb:// protocol", () => {
    expect(
      transformLinkUri(
        "smb://192.168.117.200/dulieuchung/P.HanhChanhNhanSu/file.xlsx"
      )
    ).toBe(
      "smb://192.168.117.200/dulieuchung/P.HanhChanhNhanSu/file.xlsx"
    );
  });

  it("preserves smb: protocol in ensureHrefProtocol", () => {
    expect(
      ensureHrefProtocol(
        "smb://192.168.117.200/dulieuchung/P.HanhChanhNhanSu/file.xlsx"
      )
    ).toBe(
      "smb://192.168.117.200/dulieuchung/P.HanhChanhNhanSu/file.xlsx"
    );
  });
});

import { ValidSources } from "../types";
import { OnyxDocument } from "./interfaces";
import { openDocument, openLink, convertSmbToUnc } from "./utils";

const mockToast = jest.fn();
jest.mock("@/hooks/useToast", () => ({
  toast: (...args: any[]) => mockToast(...args),
}));

const mockCopyText = jest.fn().mockImplementation(() => Promise.resolve());
jest.mock("@opal/utils", () => ({
  copyText: (...args: any[]) => mockCopyText(...args),
}));

function makeDocument(overrides: Partial<OnyxDocument>): OnyxDocument {
  return {
    document_id: "doc-1",
    semantic_identifier: "doc.pdf",
    link: "",
    source_type: ValidSources.File,
    blurb: "",
    boost: 0,
    hidden: false,
    score: 0,
    chunk_ind: 0,
    match_highlights: [],
    metadata: {},
    updated_at: null,
    is_internet: false,
    ...overrides,
  };
}

describe("openDocument", () => {
  let windowOpen: jest.Mock;

  beforeEach(() => {
    windowOpen = jest.fn();
    (global as unknown as { window: { open: jest.Mock } }).window = {
      open: windowOpen,
    };
  });

  it("opens the link in a new tab when one is present", () => {
    const updatePresentingDocument = jest.fn();
    const document = makeDocument({
      link: "https://example.com/doc.pdf",
      source_type: ValidSources.Web,
    });

    openDocument(document, updatePresentingDocument);

    expect(windowOpen).toHaveBeenCalledWith(
      "https://example.com/doc.pdf",
      "_blank",
      "noopener,noreferrer"
    );
    expect(updatePresentingDocument).not.toHaveBeenCalled();
  });

  it("opens the in-app preview for connector File documents without a link", () => {
    const updatePresentingDocument = jest.fn();
    const document = makeDocument({
      link: "",
      source_type: ValidSources.File,
    });

    openDocument(document, updatePresentingDocument);

    expect(windowOpen).not.toHaveBeenCalled();
    expect(updatePresentingDocument).toHaveBeenCalledWith(document);
  });

  it("opens the in-app preview for user-uploaded UserFile documents without a link", () => {
    const updatePresentingDocument = jest.fn();
    const document = makeDocument({
      link: "",
      source_type: ValidSources.UserFile,
    });

    openDocument(document, updatePresentingDocument);

    expect(windowOpen).not.toHaveBeenCalled();
    expect(updatePresentingDocument).toHaveBeenCalledWith(document);
  });

  it("does nothing for non-file sources without a link", () => {
    const updatePresentingDocument = jest.fn();
    const document = makeDocument({
      link: "",
      source_type: ValidSources.Web,
    });

    openDocument(document, updatePresentingDocument);

    expect(windowOpen).not.toHaveBeenCalled();
    expect(updatePresentingDocument).not.toHaveBeenCalled();
  });

  it("tolerates a missing updatePresentingDocument callback", () => {
    const document = makeDocument({
      link: "",
      source_type: ValidSources.UserFile,
    });

    expect(() => openDocument(document)).not.toThrow();
    expect(windowOpen).not.toHaveBeenCalled();
  });
});

describe("convertSmbToUnc", () => {
  it("converts standard smb:// links to Windows UNC paths", () => {
    expect(
      convertSmbToUnc(
        "smb://192.168.117.200/dulieuchung/P.HanhChanhNhanSu/dao%20tao%20nhan%20vien%20moi/DAO%20TAO%20NHAN%20VIEN%20MOI%20-%20DONG%20GOI%20HANG%20DI%20TINH.pptx"
      )
    ).toBe(
      "\\\\192.168.117.200\\dulieuchung\\P.HanhChanhNhanSu\\dao tao nhan vien moi\\DAO TAO NHAN VIEN MOI - DONG GOI HANG DI TINH.pptx"
    );
  });

  it("handles smb: format and extra slashes gracefully", () => {
    expect(convertSmbToUnc("smb:///192.168.1.1/share/file.txt")).toBe(
      "\\\\192.168.1.1\\share\\file.txt"
    );
    expect(convertSmbToUnc("smb:192.168.1.1/share/file.txt")).toBe(
      "\\\\192.168.1.1\\share\\file.txt"
    );
  });
});

describe("openLink", () => {
  let windowOpen: jest.Mock;

  beforeEach(() => {
    mockToast.mockClear();
    mockCopyText.mockClear();
    windowOpen = jest.fn();
    (global as unknown as { window: { open: jest.Mock } }).window = {
      open: windowOpen,
    };
  });

  it("copies UNC path and shows toast for SMB URLs", async () => {
    const smbUrl = "smb://192.168.1.1/share/file.txt";
    openLink(smbUrl);

    expect(mockCopyText).toHaveBeenCalledWith("\\\\192.168.1.1\\share\\file.txt");
    
    // Wait for the promise in copyText to resolve
    await new Promise(process.nextTick);

    expect(mockToast).toHaveBeenCalledWith({
      message: "Copied Windows path (UNC) to clipboard!",
      description: "\\\\192.168.1.1\\share\\file.txt",
      level: "success",
    });
    expect(windowOpen).toHaveBeenCalledWith(
      "onyx-open://open?path=%5C%5C192.168.1.1%5Cshare%5Cfile.txt"
    );
  });

  it("calls window.open for non-SMB URLs", () => {
    const normalUrl = "https://example.com/doc.pdf";
    openLink(normalUrl);

    expect(windowOpen).toHaveBeenCalledWith(normalUrl, "_blank", "noopener,noreferrer");
    expect(mockCopyText).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});

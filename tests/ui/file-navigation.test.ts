import { expect, it } from "vitest"
import { absoluteFilePath, fileAncestors, parentFilePath, relativeFilePath, browserWorkspacePath, toggleExpandedFiles } from "../../src/ui/file-navigation.js"

it("maps canonical browser paths back to the original workspace, including macOS /var aliases", () => {
  expect(browserWorkspacePath("/private/var/proj", "/var/proj", "/var/proj", "/private/var/proj/data/a.csv")).toBe("data/a.csv")
  expect(browserWorkspacePath("/private/var/proj/session", "/var/proj/session", "/var/proj", "/private/var/proj/session/data/a.csv")).toBe("session/data/a.csv")
  expect(browserWorkspacePath("/private/var/other", "/var/other", "/var/proj", "/private/var/other/a.csv")).toBeUndefined()
  expect(toggleExpandedFiles(["results", "results/deep"], "/work/results", false, "/work")).toEqual([])
})

it("keeps POSIX roots and distinguishes sibling paths", () => {
  expect(parentFilePath("/")).toBeNull()
  expect(parentFilePath("/work/project/results/")).toBe("/work/project")
  expect(relativeFilePath("/work/project", "/work/project/results/a.png")).toBe("results/a.png")
  expect(relativeFilePath("/work/project", "/work/project-other/a.png")).toBeUndefined()
  expect(absoluteFilePath("results/a.png", "/work/project")).toBe("/work/project/results/a.png")
  expect(fileAncestors("/work/project")).toEqual([{ label: "/", path: "/" }, { label: "work", path: "/work" }, { label: "project", path: "/work/project" }])
})

it("handles Windows drive and UNC roots without depending on the host OS", () => {
  expect(parentFilePath("C:\\")).toBeNull()
  expect(parentFilePath("C:/data")).toBe("C:/")
  expect(parentFilePath("C:\\研究项目\\results")).toBe("C:/研究项目")
  expect(parentFilePath("//server/share")).toBeNull()
  expect(parentFilePath("//server/share/data")).toBe("//server/share")
  expect(relativeFilePath("C:\\Project", "c:/project/data.csv")).toBe("data.csv")
  expect(relativeFilePath("C:/Project", "D:/Project/a.csv")).toBeUndefined()
  expect(fileAncestors("//server/share/研究")[0]).toEqual({ label: "//server/share", path: "//server/share" })
  expect(absoluteFilePath("file.csv", "C:/")).toBe("C:/file.csv")
})

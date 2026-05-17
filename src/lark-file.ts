import type {TFile} from "obsidian";

export const LARK_MARKDOWN_SUFFIX = ".lark.md";

type FileLike = Pick<TFile, "extension" | "path">;

export function isLarkMarkdownPath(path: string): boolean {
	return path.endsWith(LARK_MARKDOWN_SUFFIX);
}

export function isLarkMarkdownFile(file: FileLike | null | undefined): boolean {
	return !!file && file.extension === "md" && isLarkMarkdownPath(file.path);
}

export function getLarkMarkdownPathFromViewState(
	viewState: {type?: string; state?: {file?: unknown}}
): string | undefined {
	const filePath = viewState.type === "markdown" ? viewState.state?.file : undefined;
	return typeof filePath === "string" && isLarkMarkdownPath(filePath) ? filePath : undefined;
}

export function getSyncedMarkdownFilename(file: FileLike, title: string): string {
	const suffix = isLarkMarkdownFile(file) ? LARK_MARKDOWN_SUFFIX : `.${file.extension}`;
	return `${title}${suffix}`;
}

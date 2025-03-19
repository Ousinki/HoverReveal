import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessor, MarkdownRenderChild } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { Extension } from '@codemirror/state';


interface HoverRevealSettings {
	tooltipTextColor: string;
	tooltipBackgroundColor: string;
	tooltipBorderColor: string;
	boldTextColor: string;
}

const DEFAULT_SETTINGS: HoverRevealSettings = {
	tooltipTextColor: 'var(--text-normal)',
	tooltipBackgroundColor: 'var(--background-primary)',
	tooltipBorderColor: 'var(--background-modifier-border)',
	boldTextColor: 'var(--bold-color)'
}

export default class HoverRevealPlugin extends Plugin {
	settings: HoverRevealSettings;

	async onload() {
		await this.loadSettings();

		
		this.addSettingTab(new HoverRevealSettingTab(this.app, this));

		
		this.registerMarkdownPostProcessor((element, context) => {
			
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
				null
			);

			const nodesToProcess = [];
			let node;
			while (node = walker.nextNode()) {
				nodesToProcess.push(node);
			}

			nodesToProcess.forEach(textNode => {
				const text = textNode.textContent;
				if (!text) return;

				const regex = /\[(.*?)\]\{(.*?)\}/g;
				let match;
				let lastIndex = 0;
				const fragments = [];

				while ((match = regex.exec(text)) !== null) {
					
					if (match.index > lastIndex) {
						fragments.push(document.createTextNode(
							text.slice(lastIndex, match.index)
						));
					}

					const [fullMatch, visibleText, tooltipText] = match;
					
					
					const container = document.createElement('span');
					container.addClass('hover-reveal-container');
					
					
					const renderedElement = document.createElement('span');
					renderedElement.addClass('hover-reveal');
					renderedElement.setText(visibleText);
					
					
					const tooltip = document.createElement('div');
					tooltip.addClass('hover-reveal-tooltip');
					tooltip.setText(tooltipText);
					
					renderedElement.appendChild(tooltip);
					container.appendChild(renderedElement);
					fragments.push(container);
					
					lastIndex = match.index + fullMatch.length;
				}

				
				if (lastIndex < text.length) {
					fragments.push(document.createTextNode(
						text.slice(lastIndex)
					));
				}

				
				if (fragments.length > 0 && textNode.parentNode) {
					const fragment = document.createDocumentFragment();
					fragments.forEach(f => fragment.appendChild(f));
					textNode.parentNode.replaceChild(fragment, textNode);
				}
			});
		});

		
		this.registerEditorExtension(this.hoverRevealExtension());
	}

	onunload() {
		
		const oldStyle = document.getElementById('hover-reveal-custom-styles');
		if (oldStyle) {
			oldStyle.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private hoverRevealExtension(): Extension {
		class TooltipWidget extends WidgetType {
			constructor(
				readonly visibleText: string,
				readonly tooltipText: string,
				readonly from: number,
				readonly to: number,
				readonly view: EditorView,
				readonly isActive: boolean
			) {
				super();
			}

			toDOM() {
				const span = document.createElement('span');
				
				if (this.isActive) {
					span.textContent = `[${this.visibleText}]{${this.tooltipText}}`;
				} else {
					span.addClass('hover-reveal');
					span.setText(this.visibleText);

					const tooltip = document.createElement('div');
					tooltip.addClass('hover-reveal-tooltip');
					tooltip.setText(this.tooltipText);
					span.appendChild(tooltip);
				}

				return span;
			}

			eq(other: TooltipWidget): boolean {
				return other.visibleText === this.visibleText && 
					   other.tooltipText === this.tooltipText &&
					   other.from === this.from &&
					   other.to === this.to &&
					   other.isActive === this.isActive;
			}
		}

		const tooltipPlugin = ViewPlugin.fromClass(class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView) {
				const widgets = [];
				const content = view.state.doc.toString();
				const regex = /\[(.*?)\]\{(.*?)\}/g;
				let match;

				while ((match = regex.exec(content)) !== null) {
					const [fullMatch, visibleText, tooltipText] = match;
					const from = match.index;
					const to = from + fullMatch.length;

					
					const cursor = view.state.selection.main.from;
					
					const isCursorInside = cursor >= from && cursor <= to;

					if (isCursorInside) {

					} else {
						widgets.push(Decoration.replace({
							widget: new TooltipWidget(
								visibleText, 
								tooltipText,
								from,
								to,
								view,
								false
							),
							inclusive: true
						}).range(from, to));
					}
				}

				return Decoration.set(widgets);
			}
		}, {
			decorations: v => v.decorations as DecorationSet
		});

		return [tooltipPlugin];
	}

	updateStyles() {
		const style = document.createElement('style');
		style.id = 'hover-reveal-custom-styles';
		style.textContent = `
			.hover-reveal-tooltip {
				color: ${this.settings.tooltipTextColor} !important;
				background-color: ${this.settings.tooltipBackgroundColor} !important;
				border-color: ${this.settings.tooltipBorderColor} !important;
			}
			.hover-reveal-tooltip::after {
				border-top-color: ${this.settings.tooltipBackgroundColor} !important;
			}
			.hover-reveal {
				color: ${this.settings.boldTextColor} !important;
			}
		`;

		const oldStyle = document.getElementById('hover-reveal-custom-styles');
		if (oldStyle) {
			oldStyle.remove();
		}

		document.head.appendChild(style);
	}
}

class HoverRevealSettingTab extends PluginSettingTab {
	plugin: HoverRevealPlugin;

	constructor(app: App, plugin: HoverRevealPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private getComputedColor(cssVar: string): string {
		// 创建一个临时元素来获取计算后的颜色
		const temp = document.createElement('div');
		document.body.appendChild(temp);
		temp.style.color = cssVar;
		
		// 获取计算后的颜色
		const computedColor = getComputedStyle(temp).color;
		document.body.removeChild(temp);

		// 将 rgb 转换为 16 进制
		if (computedColor.startsWith('rgb')) {
			const [r, g, b] = computedColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
			return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		}
		
		return computedColor || cssVar;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		// Add reset setting at the top
		new Setting(containerEl)
			.setName('Reset settings')
			.setDesc('Reset all settings to default values')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					// Reset to default settings
					this.plugin.settings.tooltipTextColor = DEFAULT_SETTINGS.tooltipTextColor;
					this.plugin.settings.tooltipBackgroundColor = DEFAULT_SETTINGS.tooltipBackgroundColor;
					this.plugin.settings.tooltipBorderColor = DEFAULT_SETTINGS.tooltipBorderColor;
					this.plugin.settings.boldTextColor = DEFAULT_SETTINGS.boldTextColor;
					
					// Save settings
					await this.plugin.saveSettings();
					
					// Update UI and styles
					this.display();
					this.plugin.updateStyles();
					
					// Show notification
					new Notice('Reset settings to default');
				}));

		// Text color setting
		let textColorText: any;
		let textColorPicker: any;
		const computedTextColor = this.getComputedColor(this.plugin.settings.tooltipTextColor);
		new Setting(containerEl)
			.setName('Tooltip text color')
			.setDesc('Set the text color of the tooltip')
			.addText(text => {
				textColorText = text
					.setPlaceholder('var(--text-normal)')
					.setValue(computedTextColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipTextColor = value;
						textColorPicker.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return textColorText;
			})
			.addColorPicker(color => {
				textColorPicker = color
					.setValue(computedTextColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipTextColor = value;
						textColorText.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return textColorPicker;
			});

		// Background color setting
		let bgColorText: any;
		let bgColorPicker: any;
		const computedBgColor = this.getComputedColor(this.plugin.settings.tooltipBackgroundColor);
		new Setting(containerEl)
			.setName('Tooltip background color')
			.setDesc('Set the background color of the tooltip')
			.addText(text => {
				bgColorText = text
					.setPlaceholder('var(--background-primary)')
					.setValue(computedBgColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipBackgroundColor = value;
						bgColorPicker.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return bgColorText;
			})
			.addColorPicker(color => {
				bgColorPicker = color
					.setValue(computedBgColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipBackgroundColor = value;
						bgColorText.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return bgColorPicker;
			});

		// Border color setting
		let borderColorText: any;
		let borderColorPicker: any;
		const computedBorderColor = this.getComputedColor(this.plugin.settings.tooltipBorderColor);
		new Setting(containerEl)
			.setName('Tooltip border color')
			.setDesc('Set the border color of the tooltip')
			.addText(text => {
				borderColorText = text
					.setPlaceholder('var(--background-modifier-border)')
					.setValue(computedBorderColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipBorderColor = value;
						borderColorPicker.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return borderColorText;
			})
			.addColorPicker(color => {
				borderColorPicker = color
					.setValue(computedBorderColor)
					.onChange(async (value) => {
						this.plugin.settings.tooltipBorderColor = value;
						borderColorText.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return borderColorPicker;
			});

		// Bold text color setting
		let boldColorText: any;
		let boldColorPicker: any;
		const computedBoldColor = this.getComputedColor(this.plugin.settings.boldTextColor);
		new Setting(containerEl)
			.setName('Bold text color')
			.setDesc('Set the color of the bold text')
			.addText(text => {
				boldColorText = text
					.setPlaceholder('var(--bold-color)')
					.setValue(computedBoldColor)
					.onChange(async (value) => {
						this.plugin.settings.boldTextColor = value;
						boldColorPicker.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return boldColorText;
			})
			.addColorPicker(color => {
				boldColorPicker = color
					.setValue(computedBoldColor)
					.onChange(async (value) => {
						this.plugin.settings.boldTextColor = value;
						boldColorText.setValue(value);
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					});
				return boldColorPicker;
			});
	}
}

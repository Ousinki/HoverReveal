import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessor, MarkdownRenderChild } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { Extension } from '@codemirror/state';

// Remember to rename these classes and interfaces!

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
}

class HoverRevealSettingTab extends PluginSettingTab {
	plugin: HoverRevealPlugin;

	constructor(app: App, plugin: HoverRevealPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
					this.updateStyles();
					
					// Show notification
					new Notice('Reset settings to default');
				}));

		// Text color setting
		new Setting(containerEl)
			.setName('Tooltip text color')
			.setDesc('Set the text color of the tooltip')
			.addText(text => text
				.setPlaceholder('#000000')
				.setValue(this.plugin.settings.tooltipTextColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipTextColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.tooltipTextColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipTextColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}));

		// Background color setting
		new Setting(containerEl)
			.setName('Tooltip background color')
			.setDesc('Set the background color of the tooltip')
			.addText(text => text
				.setPlaceholder('var(--background-primary)')
				.setValue(this.plugin.settings.tooltipBackgroundColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipBackgroundColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.tooltipBackgroundColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipBackgroundColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}));

		// Border color setting
		new Setting(containerEl)
			.setName('Tooltip border color')
			.setDesc('Set the border color of the tooltip')
			.addText(text => text
				.setPlaceholder('var(--background-modifier-border)')
				.setValue(this.plugin.settings.tooltipBorderColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipBorderColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.tooltipBorderColor)
				.onChange(async (value) => {
					this.plugin.settings.tooltipBorderColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}));

		// Bold text color setting
		new Setting(containerEl)
			.setName('Bold text color')
			.setDesc('Set the color of the bold text')
			.addText(text => text
				.setPlaceholder('var(--bold-color)')
				.setValue(this.plugin.settings.boldTextColor)
				.onChange(async (value) => {
					this.plugin.settings.boldTextColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.boldTextColor)
				.onChange(async (value) => {
					this.plugin.settings.boldTextColor = value;
					await this.plugin.saveSettings();
					this.updateStyles();
				}));
	}


	updateStyles() {
		const style = document.createElement('style');
		style.id = 'hover-reveal-custom-styles';
		style.textContent = `
			.hover-reveal-tooltip {
				color: ${this.plugin.settings.tooltipTextColor} !important;
				background-color: ${this.plugin.settings.tooltipBackgroundColor} !important;
				border-color: ${this.plugin.settings.tooltipBorderColor} !important;
			}
			.hover-reveal-tooltip::after {
				border-top-color: ${this.plugin.settings.tooltipBackgroundColor} !important;
			}
			.hover-reveal {
				color: ${this.plugin.settings.boldTextColor} !important;
			}
		`;


		const oldStyle = document.getElementById('hover-reveal-custom-styles');
		if (oldStyle) {
			oldStyle.remove();
		}


		document.head.appendChild(style);
	}
}

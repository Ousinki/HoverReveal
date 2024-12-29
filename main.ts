import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessor, MarkdownRenderChild } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { Extension } from '@codemirror/state';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	tooltipTextColor: string;
	tooltipBackgroundColor: string;
	tooltipBorderColor: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	tooltipTextColor: 'var(--text-normal)',
	tooltipBackgroundColor: 'var(--background-primary)',
	tooltipBorderColor: 'var(--background-modifier-border)'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log('HoverReveal plugin loading...');
		await this.loadSettings();

		// // This creates an icon in the left ribbon.
		// const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });

		
		// // Perform additional things with the ribbon 
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		// 注册Markdown后处理器，element是解析后的html DOM节点，context是上下文信息
		this.registerMarkdownPostProcessor((element, context) => {
			// 处理所有文本节点
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
					// 添加匹配前的文本
					if (match.index > lastIndex) {
						fragments.push(document.createTextNode(
							text.slice(lastIndex, match.index)
						));
					}

					const [fullMatch, visibleText, tooltipText] = match;
					
					// 创建悬停元素
					const container = document.createElement('span');
					container.addClass('hover-reveal-container');
					
					// 创建渲染后的元素
					const renderedElement = document.createElement('span');
					renderedElement.addClass('hover-reveal');
					renderedElement.setText(visibleText);
					
					// 创建提示框
					const tooltip = document.createElement('div');
					tooltip.addClass('hover-reveal-tooltip');
					tooltip.setText(tooltipText);
					
					renderedElement.appendChild(tooltip);
					container.appendChild(renderedElement);
					fragments.push(container);
					
					lastIndex = match.index + fullMatch.length;
				}

				// 添加剩余文本
				if (lastIndex < text.length) {
					fragments.push(document.createTextNode(
						text.slice(lastIndex)
					));
				}

				// 替换节点
				if (fragments.length > 0 && textNode.parentNode) {
					const fragment = document.createDocumentFragment();
					fragments.forEach(f => fragment.appendChild(f));
					textNode.parentNode.replaceChild(fragment, textNode);
				}
			});
		});

		// 添加编辑器扩展
		this.registerEditorExtension(this.hoverRevealExtension());

		console.log('HoverReveal plugin loaded');
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private hoverRevealExtension(): Extension {
		class TooltipWidget extends WidgetType {
			private isEditing = false;

			constructor(
				readonly visibleText: string,
				readonly tooltipText: string,
				readonly from: number,
				readonly to: number,
				readonly view: EditorView
			) {
				super();
			}

			toDOM() {
				const span = document.createElement('span');
				
				// 根据编辑状态决定显示方式
				if (this.isEditing) {
					span.textContent = `[${this.visibleText}]{${this.tooltipText}}`;
				} else {
					span.addClass('hover-reveal');
					span.setText(this.visibleText);

					const tooltip = document.createElement('div');
					tooltip.addClass('hover-reveal-tooltip');
					tooltip.setText(this.tooltipText);
					span.appendChild(tooltip);
				}

				// 添加点击事件
				span.addEventListener('click', (e) => {
					e.preventDefault();
					this.isEditing = !this.isEditing;
					this.view.requestMeasure();
				});

				return span;
			}

			eq(other: TooltipWidget): boolean {
				return other.visibleText === this.visibleText && 
					   other.tooltipText === this.tooltipText &&
					   other.from === this.from &&
					   other.to === this.to;
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

					widgets.push(Decoration.replace({
						widget: new TooltipWidget(
							visibleText, 
							tooltipText,
							from,
							to,
							view
						),
						inclusive: true
					}).range(from, to));
				}

				return Decoration.set(widgets);
			}
		}, {
			decorations: v => v.decorations,
			eventHandlers: {
				mousedown: (e: MouseEvent, view: EditorView) => {
					// 可以在这里添加额外的点击处理逻辑
					return false;
				}
			}
		});

		return [tooltipPlugin];
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		// 添加重置按钮到右下角
		const resetButton = containerEl.createEl('button', {
			text: '重置为默认样式',
			cls: 'hover-reveal-reset-button',
		});
		
		resetButton.style.cssText = `
			position: absolute;
			bottom: 20px;
			right: 20px;
			padding: 8px 12px;
			background-color: var(--interactive-accent);
			color: var(--text-on-accent);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		`;

		resetButton.addEventListener('click', async () => {
			// 重置为默认设置
			this.plugin.settings.tooltipTextColor = DEFAULT_SETTINGS.tooltipTextColor;
			this.plugin.settings.tooltipBackgroundColor = DEFAULT_SETTINGS.tooltipBackgroundColor;
			this.plugin.settings.tooltipBorderColor = DEFAULT_SETTINGS.tooltipBorderColor;
			
			// 保存设置
			await this.plugin.saveSettings();
			
			// 更新UI和样式
			this.display();
			this.updateStyles();
			
			// 显示提示
			new Notice('样式已重置为默认设置');
		});

		// 文字颜色设置
		new Setting(containerEl)
			.setName('Tooltip Text Color')
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

		// 背景颜色设置  
		new Setting(containerEl)
			.setName('Tooltip Background Color')
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

		// 边框颜色设置
		new Setting(containerEl)
			.setName('Tooltip Border Color')
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
	}

	// 更新样式
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
		`;

		// 移除旧样式
		const oldStyle = document.getElementById('hover-reveal-custom-styles');
		if (oldStyle) {
			oldStyle.remove();
		}

		// 添加新样式
		document.head.appendChild(style);
	}
}

import React, { useLayoutEffect, useRef } from 'react';
import { NativeUiBackdrop } from '../hd/NativeUiBackdrop';
import { mountSaveMenuArt } from '../save/SaveMenuArt';
import '../save/SkirmishSaveDialog.css';
interface DialogViewport {
    x: number;
    y: number;
    width: number | string;
    height: number | string;
}
export interface ButtonConfig {
    label: string;
    onClick?: () => void;
}
export interface DialogProps {
    children?: React.ReactNode;
    className?: string;
    hidden?: boolean;
    buttons: ButtonConfig[];
    viewport: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    zIndex?: number;
}
function DialogButtons({ buttons }: { buttons: ButtonConfig[] }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => mountSaveMenuArt(ref.current!), []);
    return <div className="message-box-footer" ref={ref}>{buttons.map((button, index) =>
        <button key={index} className="dialog-button save-native-button" onClick={button.onClick}>{button.label}</button>)}</div>;
}
export class Dialog extends React.Component<DialogProps> {
    render(): React.ReactNode {
        if (this.props.hidden) {
            return null;
        }
        const contentChildren = React.Children.toArray(this.props.children);
        return React.createElement('div', { style: this.getWrapperStyle() }, React.createElement('div', {
            className: 'message-box ' + (this.props.className || 'standard-message-box'),
        }, React.createElement(NativeUiBackdrop, { kind: 'dialog' }),
        React.createElement('div', { className: 'message-box-content' }, contentChildren),
        React.createElement(DialogButtons, { buttons: this.props.buttons })));
    }
    private getWrapperStyle(): React.CSSProperties {
        const viewport = this.props.viewport;
        return {
            position: 'absolute',
            top: viewport.y,
            left: viewport.x,
            width: viewport.width,
            height: viewport.height,
            zIndex: this.props.zIndex
        };
    }
}

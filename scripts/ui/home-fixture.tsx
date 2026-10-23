import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { HomeScreen } from '../../src/gui/screen/mainMenu/main/HomeScreen';
import { MenuButton } from '../../src/gui/component/MenuButton';
import { Strings } from '../../src/data/Strings';
import locale from '../../public/res/locale/zh-CN.json';
const root=createRoot(document.getElementById('ra2web-root')!);
(window as any).routeLog=[];
const screen=new HomeScreen(new Strings(locale),{alert:async(message:string)=>{
 document.getElementById('alert')!.textContent=message;
}} as any,'review');
screen.setController({setSidebarButtons:(buttons:any[])=>flushSync(()=>root.render(<>{buttons.map((b,i)=><MenuButton key={i} buttonConfig={b} box={{x:20,y:20+i*52,width:146,height:42}} onClick={b.onClick}/>)}</>)),showSidebarButtons(){},toggleMainVideo(){},showVersion(){},goToScreen:(r:any)=>(window as any).routeLog.push(r),pushScreen:(r:any)=>(window as any).routeLog.push(r)} as any);
screen.onEnter();

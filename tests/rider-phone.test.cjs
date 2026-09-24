const {test}=require("node:test");
const assert=require("node:assert/strict");
require("tsx/cjs");
const React=require("react");
global.React=React;
const {renderToStaticMarkup}=require("react-dom/server");
const {RouteLine}=require("../apps/rider-app/components/rider-contact-line.tsx");
test("rider phone component renders a visible clickable mobile telephone link",()=>{
  const html=renderToStaticMarkup(React.createElement(RouteLine,{
    icon:()=>null,label:"Klienti",value:"+355 69 123 4567",phone:true,
  }));
  assert.match(html,/href="tel:\+355691234567"/);
  assert.match(html,/>\+355 69 123 4567<\/a>/);
});

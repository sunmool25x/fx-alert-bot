import type { AuthorizationReview } from "../src/trades/review.js";
export function renderTradeReview(root:HTMLElement,view:AuthorizationReview,state:string) {
  const panel=document.createElement("section");panel.className="trade-review";
  const heading=document.createElement("h2");heading.textContent=view.title;panel.append(heading);
  const badge=document.createElement("p");badge.className="trade-review-state";badge.textContent=state;panel.append(badge);
  const rows=(parent:HTMLElement,values:[string,string][])=>{const list=document.createElement("dl");for(const[label,value]of values){const term=document.createElement("dt"),detail=document.createElement("dd");term.textContent=label;detail.textContent=value;list.append(term,detail);}parent.append(list);};
  const notes=(parent:HTMLElement,values:string[])=>{for(const value of values){const paragraph=document.createElement("p");paragraph.textContent=value;parent.append(paragraph);}};
  rows(panel,view.rows);notes(panel,view.notes);
  for(const step of view.steps){const card=document.createElement("section");card.className="authorization-step";card.dataset.authorization=step.id;
    const title=document.createElement("h3");title.textContent=step.title;card.append(title);notes(card,[step.purpose]);rows(card,step.rows);notes(card,step.notes);panel.append(card);}
  const details=document.createElement("details"),summary=document.createElement("summary");summary.textContent=view.technicalTitle;details.append(summary);rows(details,view.technical);panel.append(details);
  notes(panel,[view.footer]);root.append(panel);
}

import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export const componentFields={schemaVersion:1,repository:'sample',role:'engineer',executionProfile:'luna',interfaces:[],documentation:[],tests:[],relatedIds:[],questions:[],patterns:[]};
export const members={foundations:[],dependencies:[],gateways:[],libraries:['sample'],releases:[]};
export function catalogFixture(repo){
 for(const [path,value] of Object.entries({
  'roles/engineer':{schemaVersion:1,id:'engineer',purpose:'Bounded engineering',responsibilities:['Verify changes'],activities:['research','documentation','testing','implementation','review','release']},
  'execution-profiles/luna':{schemaVersion:1,id:'luna',model:'gpt-6-luna',reasoning:'medium',webSearch:'live',timeoutSeconds:900,commandTimeoutSeconds:120,maxTurns:3,maxCorrectiveTurns:2}
 })){mkdirSync(join(repo,'architecture',path,'..'),{recursive:true});writeFileSync(join(repo,'architecture',path+'.json'),JSON.stringify(value));}
}

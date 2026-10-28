import { BaseOrchestrator } from '../orchestrators/base.orchestrator.js';

export function Transactional(){
    return function(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ){
        const originalMethod= descriptor.value;

        descriptor.value= async function(this: BaseOrchestrator,...args: any[]){
               return this.executeInTransaction( async(transactionManager)=>{
                    return originalMethod.apply(this,[...args, transactionManager]);
               })
        }
        return descriptor;
    }
} 
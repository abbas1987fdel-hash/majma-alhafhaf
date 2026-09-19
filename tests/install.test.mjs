import { it, expect } from 'vitest';
import { createInstallController } from '../lib/install';
function offer(target, outcome='accepted', fail=false) {
 const event=new Event('beforeinstallprompt',{cancelable:true}); let calls=0;
 event.prompt=async()=>{ calls++; if(fail) throw Error('blocked'); };
 event.userChoice=Promise.resolve({outcome}); target.dispatchEvent(event);
 return {event,count:()=>calls};
}
it('keeps the browser prompt when the login view unmounts and settings mounts',async()=>{
 const target=new EventTarget(), controller=createInstallController(target,()=>false);
 const unmount=controller.subscribe(()=>{}), offered=offer(target); unmount();
 expect(offered.event.defaultPrevented).toBe(true); expect(controller.getSnapshot().available).toBe(true);
 const cleanup=controller.subscribe(()=>{});
 expect(await controller.install()).toBe('accepted');expect(offered.count()).toBe(1);
 expect(await controller.install()).toBe('unavailable');cleanup();
});
it('reports dismissals and recovers after a failed prompt with a new browser event',async()=>{
 const target=new EventTarget(), controller=createInstallController(target,()=>false);
 offer(target,'dismissed');expect(await controller.install()).toBe('dismissed');
 offer(target,'accepted',true);await expect(controller.install()).rejects.toThrow('blocked');
 expect(controller.getSnapshot().busy).toBe(false);offer(target);expect(await controller.install()).toBe('accepted');
});
it('never prompts inside standalone and observes completed installation',async()=>{
 const target=new EventTarget(), controller=createInstallController(target,()=>false);
 target.dispatchEvent(new Event('appinstalled'));expect(controller.getSnapshot().installed).toBe(true);
 expect(await controller.install()).toBe('installed');expect(await createInstallController(new EventTarget(),()=>true).install()).toBe('installed');
});

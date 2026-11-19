#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TroveShortcutsModule, NSObject)

RCT_EXTERN_METHOD(takePendingCommands:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(saveLists:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

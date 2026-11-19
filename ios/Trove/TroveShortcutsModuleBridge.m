#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TroveShortcutsModule, NSObject)

RCT_EXTERN_METHOD(takePendingCommands:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

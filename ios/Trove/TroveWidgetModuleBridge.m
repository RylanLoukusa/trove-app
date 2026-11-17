#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TroveWidgetModule, NSObject)

RCT_EXTERN_METHOD(saveSnapshot:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

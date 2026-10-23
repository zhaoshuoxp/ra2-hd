#import <Foundation/Foundation.h>
#include <mach-o/dyld.h>
#include <unistd.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    @autoreleasepool {
        uint32_t size = 0;
        _NSGetExecutablePath(NULL, &size);
        char *buffer = malloc(size);
        if (!buffer || _NSGetExecutablePath(buffer, &size)) return 1;
        NSString *executable = [[NSString stringWithUTF8String:buffer] stringByResolvingSymlinksInPath];
        free(buffer);
        NSString *bundle = [[[executable stringByDeletingLastPathComponent]
            stringByDeletingLastPathComponent] stringByDeletingLastPathComponent];
        NSString *root = [bundle stringByDeletingLastPathComponent];
        NSString *resources = [root stringByAppendingPathComponent:@"Game Resources"];
        NSString *profile = [root stringByAppendingPathComponent:@"Review Profile"];
        NSFileManager *files = [NSFileManager defaultManager];
        if (![files fileExistsAtPath:[resources stringByAppendingPathComponent:@"ra2-core-manifest.json"]]) {
            fprintf(stderr, "Keep Game Resources beside this application.\n");
            return 1;
        }
        NSError *error = nil;
        if (![files createDirectoryAtPath:profile withIntermediateDirectories:YES attributes:nil error:&error]) {
            fprintf(stderr, "%s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        NSData *registration = [NSJSONSerialization dataWithJSONObject:
            @{@"schemaVersion": @1, @"directory": resources} options:0 error:&error];
        if (!registration || ![registration writeToFile:[profile stringByAppendingPathComponent:
            @"resource-registration.json"] options:NSDataWritingAtomic error:&error]) {
            fprintf(stderr, "%s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        setenv("RA2_DESKTOP_USER_DATA", profile.fileSystemRepresentation, 1);
        setenv("RA2_DESKTOP_NO_DISCOVERY", "1", 1);
        NSString *runtime = [bundle stringByAppendingPathComponent:
            @"Contents/Resources/Runtime.app/Contents/MacOS/Electron"];
        char **arguments = calloc((size_t)argc + 1, sizeof(char *));
        if (!arguments) return 1;
        arguments[0] = (char *)runtime.fileSystemRepresentation;
        for (int i = 1; i < argc; i++) arguments[i] = argv[i];
        execv(arguments[0], arguments);
        perror("Unable to launch the review application");
        free(arguments);
        return 1;
    }
}

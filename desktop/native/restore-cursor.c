// Called only after the game releases Pointer Lock for a focused menu transition.
#include <ApplicationServices/ApplicationServices.h>
#include <math.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc != 3) return 2;
    char *xend, *yend;
    double x = strtod(argv[1], &xend), y = strtod(argv[2], &yend);
    if (*xend || *yend || !isfinite(x) || !isfinite(y)) return 2;
    return CGWarpMouseCursorPosition(CGPointMake(x, y)) == kCGErrorSuccess ? 0 : 1;
}

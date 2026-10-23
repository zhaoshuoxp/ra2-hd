import Foundation

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let data = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: input))
let converted = data.mapValues { $0.applyingTransform(StringTransform("Hans-Hant"), reverse: false) ?? $0 }
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
try encoder.encode(converted).write(to: output)

#include <algorithm>
#include <array>
#include <cctype>
#include <iostream>
#include <numeric>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#define APP_NAME "C++ Highlight Lab"
#define SQUARE(value) ((value) * (value))

namespace highlight_demo {

constexpr int kMaximumWords = 128;

enum class Status {
    idle,
    running,
    finished,
};

template <typename T, std::size_t Capacity>
class FixedBuffer {
public:
    explicit FixedBuffer(T fallback) : fallback_(std::move(fallback)) {}

    [[nodiscard]] bool push(const T& value) {
        if (size_ >= Capacity) {
            return false;
        }

        values_[size_++] = value;
        return true;
    }

    [[nodiscard]] const T& at(std::size_t index) const {
        return index < size_ ? values_[index] : fallback_;
    }

private:
    std::array<T, Capacity> values_{};
    std::size_t size_ = 0;
    T fallback_;
};

struct WordStats {
    std::string word;
    int frequency = 0;
    double score = 0.0;
};

std::vector<WordStats> analyze(std::string_view text) {
    std::unordered_map<std::string, int> frequencies;
    frequencies.reserve(kMaximumWords);
    std::string current;

    // 字符串中的括号 "({[]})" 不应该被当成代码括号着色。
    for (const char rawCharacter : text) {
        const auto character = static_cast<unsigned char>(rawCharacter);
        if (std::isalpha(character)) {
            current.push_back(static_cast<char>(std::tolower(character)));
        } else if (!current.empty()) {
            ++frequencies[current];
            current.clear();
        }
    }

    if (!current.empty()) {
        ++frequencies[current];
    }

    std::vector<WordStats> result;
    result.reserve(frequencies.size());
    for (const auto& [word, frequency] : frequencies) {
        result.push_back({word, frequency, frequency * 1.25});
    }

    std::ranges::sort(result, [](const WordStats& left, const WordStats& right) {
        if (left.frequency != right.frequency) {
            return left.frequency > right.frequency;
        }
        return left.word < right.word;
    });

    return result;
}

std::optional<WordStats> findBest(const std::vector<WordStats>& stats) {
    if (stats.empty()) {
        return std::nullopt;
    }
    return stats.front();
}

}  // namespace highlight_demo

int main() {
    using highlight_demo::FixedBuffer;
    using highlight_demo::Status;

    const std::string sample = R"(Algorithm templates make repeated practice easier.
Templates, problems, and notes form a personal knowledge workspace.)";

    const auto stats = highlight_demo::analyze(sample);
    const auto best = highlight_demo::findBest(stats);
    FixedBuffer<std::string, 4> recentWords{"<empty>"};

    for (const auto& item : stats) {
        if (item.frequency > 0 && recentWords.push(item.word)) {
            std::cout << item.word << " -> " << item.frequency
                      << " (score=" << item.score << ")\n";
        }
    }

    const Status status = best.has_value() ? Status::finished : Status::idle;
    std::cout << APP_NAME << " | best=" << recentWords.at(0)
              << " | square=" << SQUARE(7)
              << " | status=" << static_cast<int>(status) << '\n';

    return 0;
}

// The filename is an adversarial distractor.
#include <array>
#include <queue>
#include <string>
#include <vector>
struct AhoCorasick {
  struct Node { std::array<int,26> next{}; int fail=0, output=0; };
  std::vector<Node> trie{{}};
  void insert(const std::string& word) { int node=0; for(char ch:word){int c=ch-'a'; if(!trie[node].next[c]){trie[node].next[c]=trie.size();trie.push_back({});}node=trie[node].next[c];}++trie[node].output; }
  void build(){std::queue<int> q;for(int c=0;c<26;++c)if(trie[0].next[c])q.push(trie[0].next[c]);while(!q.empty()){int node=q.front();q.pop();for(int c=0;c<26;++c){int child=trie[node].next[c];if(child){trie[child].fail=trie[trie[node].fail].next[c];q.push(child);}else trie[node].next[c]=trie[trie[node].fail].next[c];}}}
  int count(const std::string& text) const {int node=0,total=0;for(char ch:text){node=trie[node].next[ch-'a'];for(int cursor=node;cursor;cursor=trie[cursor].fail)total+=trie[cursor].output;}return total;}
};
int main(){AhoCorasick ac;ac.insert("he");ac.insert("she");ac.build();return ac.count("she")==2?0:1;}

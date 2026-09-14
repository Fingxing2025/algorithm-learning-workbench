#include <cstddef>
#include <cstdio>
class FastInput {
  static constexpr std::size_t size=1<<12; char buffer[size]{};std::size_t index=0,length=0;
  char next(){if(index==length){length=std::fread(buffer,1,size,stdin);index=0;if(!length)return 0;}return buffer[index++];}
public:
  int read_int(){char ch;do{ch=next();}while(ch&&ch<=' ');int sign=1,value=0;if(ch=='-'){sign=-1;ch=next();}while(ch>='0'&&ch<='9'){value=value*10+ch-'0';ch=next();}return value*sign;}
};
int main(){FastInput input; (void)input; return 0;}
